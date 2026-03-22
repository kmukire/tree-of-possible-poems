"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import treeImage from "../assets/cleaner tree.jpg";
import styles from "./page.module.css";
import { fetchUserPoems, savePoem } from "../lib/poems";
import { getSupabaseBrowserClient } from "../lib/supabase/client";

const TOTAL_ROUNDS = 5;
const POEM_SESSION_STORAGE_KEY = "tree-of-possible-poems-session";

export default function Home() {
  const [introHidden, setIntroHidden] = useState(false);
  const [experienceVisible, setExperienceVisible] = useState(false);
  const [firstLine, setFirstLine] = useState("");
  const [poemLines, setPoemLines] = useState([]);
  const [round, setRound] = useState(0);
  const [customLine, setCustomLine] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [options, setOptions] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [savedPoems, setSavedPoems] = useState([]);
  const [isLoadingArchive, setIsLoadingArchive] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [archiveVisible, setArchiveVisible] = useState(false);
  const [selectedArchivedPoem, setSelectedArchivedPoem] = useState(null);
  const [hasRestoredState, setHasRestoredState] = useState(false);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      const rawState = window.localStorage.getItem(POEM_SESSION_STORAGE_KEY);

      if (!rawState) {
        setHasRestoredState(true);
        return;
      }

      const savedState = JSON.parse(rawState);

      setIntroHidden(Boolean(savedState.introHidden));
      setExperienceVisible(Boolean(savedState.experienceVisible));
      setFirstLine(savedState.firstLine ?? "");
      setPoemLines(Array.isArray(savedState.poemLines) ? savedState.poemLines : []);
      setRound(Number.isInteger(savedState.round) ? savedState.round : 0);
      setCustomLine(savedState.customLine ?? "");
      setShowCustomInput(Boolean(savedState.showCustomInput));
      setOptions(Array.isArray(savedState.options) ? savedState.options : []);
      setArchiveVisible(Boolean(savedState.archiveVisible));
      setSelectedArchivedPoem(savedState.selectedArchivedPoem ?? null);
    } catch (error) {
      console.error("Could not restore poem session state", error);
    } finally {
      setHasRestoredState(true);
    }
  }, []);

  useEffect(() => {
    if (!introHidden || experienceVisible) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setExperienceVisible(true);
    }, 420);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [experienceVisible, introHidden]);

  useEffect(() => {
    if (!hasRestoredState || typeof window === "undefined") {
      return;
    }

    const stateToPersist = {
      introHidden,
      experienceVisible,
      firstLine,
      poemLines,
      round,
      customLine,
      showCustomInput,
      options,
      archiveVisible,
      selectedArchivedPoem,
    };

    window.localStorage.setItem(
      POEM_SESSION_STORAGE_KEY,
      JSON.stringify(stateToPersist)
    );
  }, [
    archiveVisible,
    customLine,
    experienceVisible,
    firstLine,
    hasRestoredState,
    introHidden,
    options,
    poemLines,
    round,
    selectedArchivedPoem,
    showCustomInput,
  ]);

  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted) {
        setSession(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setArchiveVisible(false);
      setSelectedArchivedPoem(null);
      setAuthError("");
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !session?.user?.id) {
      setSavedPoems([]);
      return;
    }

    let cancelled = false;

    const loadPoems = async () => {
      setIsLoadingArchive(true);
      setArchiveError("");

      try {
        const poems = await fetchUserPoems(supabase, session.user.id);

        if (!cancelled) {
          setSavedPoems(poems);
        }
      } catch (error) {
        if (!cancelled) {
          setArchiveError(
            error instanceof Error ? error.message : "Could not load archive."
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingArchive(false);
        }
      }
    };

    loadPoems();

    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, supabase]);

  const hasStarted = poemLines.length > 0;
  const isFinished = hasStarted && round >= TOTAL_ROUNDS;
  const isClosingRound = round === TOTAL_ROUNDS - 1;
  const needsAuth = experienceVisible && !session;

  const requestContinuations = async (lines, nextRound) => {
    const response = await fetch("/api/continuations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        firstLine: lines[0],
        poemSoFar: lines,
        previousLine: lines[lines.length - 1],
        round: nextRound,
        isFinalRound: nextRound === TOTAL_ROUNDS,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Could not generate continuation lines.");
    }

    return payload.lines;
  };

  const resetPoem = () => {
    setFirstLine("");
    setPoemLines([]);
    setRound(0);
    setCustomLine("");
    setShowCustomInput(false);
    setOptions([]);
    setGenerationError("");
    setSaveStatus("");
    setArchiveVisible(false);
    setSelectedArchivedPoem(null);
  };

  const handleGoHome = () => {
    resetPoem();
    setIntroHidden(false);
    setExperienceVisible(false);
    setGenerationError("");
    setAuthError("");
    setAuthMessage("");
  };

  const handleAuthSubmit = async () => {
    if (!supabase) {
      setAuthError("Missing Supabase environment variables.");
      return;
    }

    setIsAuthenticating(true);
    setAuthError("");
    setAuthMessage("");

    try {
      if (authMode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });

        if (error) {
          throw error;
        }

        setAuthMessage(
          "Account created. Check your email to confirm your account, then log in to continue."
        );
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          throw error;
        }
      }
    } catch (error) {
      setAuthError(
        error instanceof Error ? error.message : "Could not complete authentication."
      );
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
    resetPoem();
    setEmail("");
    setPassword("");
  };

  const handleBeginPoem = async () => {
    const trimmed = firstLine.trim();

    if (!trimmed) {
      return;
    }

    setIsGenerating(true);
    setGenerationError("");
    setSaveStatus("");

    try {
      const rootLines = [trimmed];
      const generatedLines = await requestContinuations(rootLines, 1);

      setPoemLines(rootLines);
      setOptions(generatedLines);
      setRound(0);
      setCustomLine("");
      setShowCustomInput(false);
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Could not generate continuation lines."
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const advancePoem = async (line) => {
    const trimmed = line.trim();

    if (!trimmed || isFinished) {
      return;
    }

    const nextPoemLines = [...poemLines, trimmed];
    const nextRound = round + 1;

    setPoemLines(nextPoemLines);
    setRound(nextRound);
    setCustomLine("");
    setShowCustomInput(false);
    setGenerationError("");
    setSaveStatus("");

    if (nextRound >= TOTAL_ROUNDS) {
      setOptions([]);
      return;
    }

    setIsGenerating(true);

    try {
      const generatedLines = await requestContinuations(nextPoemLines, nextRound + 1);
      setOptions(generatedLines);
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : "Could not generate continuation lines."
      );
      setOptions([]);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSavePoem = async () => {
    if (!supabase || !session?.user?.id || !isFinished) {
      return;
    }

    setSaveStatus("Saving...");

    try {
      const savedPoem = await savePoem(supabase, session.user.id, poemLines);
      setSavedPoems((current) => [savedPoem, ...current]);
      setSaveStatus("Poem saved.");
    } catch (error) {
      setSaveStatus(
        error instanceof Error ? error.message : "Could not save poem."
      );
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.backgroundLayer} aria-hidden="true">
        <Image
          src={treeImage}
          alt=""
          fill
          priority
          className={styles.backgroundImage}
          sizes="100vw"
        />
      </div>

      <section
        className={`${styles.content} ${introHidden ? styles.contentHidden : ""}`}
      >
        <h1 className={styles.title}>A Tree of Possible Poems</h1>
        <p className={styles.subtext}>Every poem begins somewhere.</p>
        <button
          type="button"
          className={styles.beginLink}
          onClick={() => setIntroHidden(true)}
        >
          Begin <span aria-hidden="true">→</span>
        </button>
      </section>

      <section
        className={`${styles.writerPanel} ${
          experienceVisible ? styles.writerPanelVisible : ""
        } ${isFinished ? styles.writerPanelFinal : ""}`}
      >
        {session ? (
          <div className={styles.userBar}>
            <span className={styles.userMeta}>{session.user.email}</span>
            <div className={styles.userBarActions}>
              <button
                type="button"
                className={styles.inlineAction}
                onClick={handleGoHome}
              >
                Home
              </button>
              <button
                type="button"
                className={styles.inlineAction}
                onClick={() => {
                  setArchiveVisible((current) => !current);
                  setSelectedArchivedPoem(null);
                }}
              >
                {archiveVisible ? "Close archive" : "Archive"}
              </button>
              <button
                type="button"
                className={styles.inlineAction}
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          </div>
        ) : null}

        {needsAuth ? (
          <>
            <p className={styles.instruction}>Account</p>
            <h2 className={styles.panelTitle}>
              {authMode === "signup" ? "Create your account." : "Log in to continue."}
            </h2>
            <div className={styles.authFields}>
              <input
                type="email"
                className={styles.textInput}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                autoComplete="email"
              />
              <input
                type="password"
                className={styles.textInput}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                autoComplete={
                  authMode === "signup" ? "new-password" : "current-password"
                }
              />
            </div>
            {authMessage ? <p className={styles.statusText}>{authMessage}</p> : null}
            {authError ? <p className={styles.errorText}>{authError}</p> : null}
            {!supabase ? (
              <p className={styles.errorText}>
                Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
                to use authentication.
              </p>
            ) : null}
            <div className={styles.authActions}>
              <button
                type="button"
                className={styles.panelAction}
                onClick={handleAuthSubmit}
                disabled={isAuthenticating || !supabase}
              >
                {isAuthenticating
                  ? authMode === "signup"
                    ? "Creating..."
                    : "Logging in..."
                  : authMode === "signup"
                    ? "Sign up"
                    : "Log in"}
                <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className={styles.inlineAction}
                onClick={() =>
                  setAuthMode((current) =>
                    current === "signup" ? "login" : "signup"
                  )
                }
              >
                {authMode === "signup"
                  ? "Already have an account?"
                  : "Need an account?"}
              </button>
            </div>
          </>
        ) : archiveVisible ? (
          <>
            {selectedArchivedPoem ? (
              <>
                <p className={styles.instruction}>Archive</p>
                <h2 className={styles.panelTitle}>Opened poem.</h2>
                <div className={`${styles.poemPreview} ${styles.poemPreviewFinal}`}>
                  <span className={styles.previewLabel}>
                    {new Date(selectedArchivedPoem.createdAt).toLocaleDateString()}
                  </span>
                  <div className={styles.previewLines}>
                    {selectedArchivedPoem.lines.map((line, index) => (
                      <p
                        key={`${selectedArchivedPoem.id}-${index}`}
                        className={styles.previewLine}
                      >
                        {line}
                      </p>
                    ))}
                  </div>
                </div>
                <div className={styles.finalActions}>
                  <button
                    type="button"
                    className={styles.panelAction}
                    onClick={() => setSelectedArchivedPoem(null)}
                  >
                    Back to archive <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    className={styles.panelAction}
                    onClick={resetPoem}
                  >
                    Start again <span aria-hidden="true">→</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className={styles.instruction}>Archive</p>
                <h2 className={styles.panelTitle}>Saved poems.</h2>
                {archiveError ? <p className={styles.errorText}>{archiveError}</p> : null}
                {isLoadingArchive ? (
                  <p className={styles.statusText}>Loading archive...</p>
                ) : savedPoems.length > 0 ? (
                  <div className={styles.archiveGrid}>
                    {savedPoems.map((poem) => (
                      <button
                        key={poem.id}
                        type="button"
                        className={styles.archiveCard}
                        onClick={() => setSelectedArchivedPoem(poem)}
                      >
                        <p className={styles.archiveDate}>
                          {new Date(poem.createdAt).toLocaleDateString()}
                        </p>
                        <div className={styles.archivePreview}>
                          {poem.lines.slice(0, 2).map((line, index) => (
                            <p
                              key={`${poem.id}-preview-${index}`}
                              className={styles.archivePreviewLine}
                            >
                              {line}
                            </p>
                          ))}
                        </div>
                        <span className={styles.archiveOpen}>
                          Open <span aria-hidden="true">→</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className={styles.statusText}>No saved poems yet.</p>
                )}
              </>
            )}
            {!selectedArchivedPoem ? (
              <button
                type="button"
                className={styles.panelAction}
                onClick={() => setArchiveVisible(false)}
              >
                Return <span aria-hidden="true">→</span>
              </button>
            ) : null}
          </>
        ) : !hasStarted ? (
          <>
            <h2 className={styles.panelTitle}>Write the first line.</h2>
            <textarea
              id="first-line"
              className={styles.textarea}
              value={firstLine}
              onChange={(event) => setFirstLine(event.target.value)}
              placeholder="The first line of the poem begins here..."
              rows={3}
            />
            {generationError ? (
              <p className={styles.errorText}>{generationError}</p>
            ) : null}
            <button
              type="button"
              className={styles.panelAction}
              onClick={handleBeginPoem}
              disabled={isGenerating}
            >
              {isGenerating ? "Generating..." : "Continue"}
              <span aria-hidden="true">→</span>
            </button>
          </>
        ) : isFinished ? (
          <>
            <p className={styles.instruction}>Complete poem</p>
            <div className={`${styles.poemPreview} ${styles.poemPreviewFinal}`}>
              <span className={styles.previewLabel}>Final poem</span>
              <div className={styles.previewLines}>
                {poemLines.map((line, index) => (
                  <p key={`final-${index}`} className={styles.previewLine}>
                    {line}
                  </p>
                ))}
              </div>
            </div>
            {saveStatus ? <p className={styles.statusText}>{saveStatus}</p> : null}
            <div className={styles.finalActions}>
              <button type="button" className={styles.panelAction} onClick={handleSavePoem}>
                Save poem <span aria-hidden="true">→</span>
              </button>
              <button type="button" className={styles.panelAction} onClick={resetPoem}>
                Start again <span aria-hidden="true">→</span>
              </button>
              <button
                type="button"
                className={styles.panelAction}
                onClick={() => setArchiveVisible(true)}
              >
                Archive <span aria-hidden="true">→</span>
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.instruction}>
              Round {round + 1} of {TOTAL_ROUNDS}
              {isClosingRound ? " • closing line" : ""}
            </p>

            <div className={styles.poemPreview}>
              <span className={styles.previewLabel}>Poem so far</span>
              <div className={styles.previewLines}>
                {poemLines.map((line, index) => (
                  <p key={`line-${index}`} className={styles.previewLine}>
                    {line}
                  </p>
                ))}
              </div>
            </div>

            <div className={styles.optionsPanel}>
              <span className={styles.previewLabel}>
                {isClosingRound ? "Choose the ending" : "Choose what follows"}
              </span>

              {generationError ? (
                <p className={styles.errorText}>{generationError}</p>
              ) : null}

              {isGenerating ? (
                <p className={styles.statusText}>
                  Generating lines from the poem so far...
                </p>
              ) : (
                <>
                  <div className={styles.branchList}>
                    {options.map((line, index) => (
                      <button
                        key={`${round}-${index}`}
                        type="button"
                        className={styles.branchCard}
                        onClick={() => advancePoem(line)}
                      >
                        <span className={styles.branchMarker} aria-hidden="true" />
                        <p className={styles.branchText}>{line}</p>
                      </button>
                    ))}
                  </div>

                  {showCustomInput ? (
                    <div className={styles.customComposer}>
                      <textarea
                        className={styles.branchInput}
                        value={customLine}
                        onChange={(event) => setCustomLine(event.target.value)}
                        placeholder="Write your own line..."
                        rows={2}
                      />
                      <button
                        type="button"
                        className={styles.panelAction}
                        onClick={() => advancePoem(customLine)}
                      >
                        Continue <span aria-hidden="true">→</span>
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.panelAction}
                      onClick={() => setShowCustomInput(true)}
                    >
                      Write your own line <span aria-hidden="true">→</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </section>
    </main>
  );
}
