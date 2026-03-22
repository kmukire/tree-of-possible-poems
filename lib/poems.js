function formatSupabaseError(error, action) {
  if (!error) {
    return `${action} failed for an unknown reason.`;
  }

  const parts = [
    error.message,
    error.details,
    error.hint,
    error.code ? `code: ${error.code}` : "",
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" | ") : `${action} failed.`;
}

export async function fetchUserPoems(supabase, userId) {
  const { data, error } = await supabase
    .from("poems")
    .select("id, first_line, lines, created_at, updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Supabase archive fetch failed", {
      userId,
      error,
    });
    throw new Error(formatSupabaseError(error, "Loading poems"));
  }

  return data.map((poem) => ({
    id: poem.id,
    firstLine: poem.first_line,
    lines: poem.lines,
    createdAt: poem.created_at,
    updatedAt: poem.updated_at,
  }));
}

export async function savePoem(supabase, userId, lines) {
  const payload = {
    user_id: userId,
    first_line: lines[0],
    lines,
  };

  const { data, error } = await supabase
    .from("poems")
    .insert(payload)
    .select("id, first_line, lines, created_at, updated_at")
    .single();

  if (error) {
    console.error("Supabase poem save failed", {
      userId,
      payload,
      error,
    });
    throw new Error(formatSupabaseError(error, "Saving poem"));
  }

  return {
    id: data.id,
    firstLine: data.first_line,
    lines: data.lines,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

export async function deletePoem(supabase, userId, poemId) {
  const { error } = await supabase
    .from("poems")
    .delete()
    .eq("id", poemId)
    .eq("user_id", userId);

  if (error) {
    console.error("Supabase poem delete failed", {
      userId,
      poemId,
      error,
    });
    throw new Error(formatSupabaseError(error, "Deleting poem"));
  }
}
