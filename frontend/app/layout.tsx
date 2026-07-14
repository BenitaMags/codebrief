export const metadata = {
  title: "Codebrief",
  description: "AI-powered codebase onboarding",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
