export const metadata = {
  title: "F&O Scanner",
  description: "Intraday F&O stock scanner",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
