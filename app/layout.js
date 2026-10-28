import "./globals.css";
import "./shopee.css";
import "./products.css";
import "./tools.css";
export const metadata = {
  title: "NS Labs ERP",
  description:
    "The NS Labs workspace for 3D printing, filament, stock, pricing and marketplace records.",
};
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
