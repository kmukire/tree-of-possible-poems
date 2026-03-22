import "./globals.css";

export const metadata = {
  title: "A Tree of Possible Poems",
  description: "Every poem begins somewhere.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
