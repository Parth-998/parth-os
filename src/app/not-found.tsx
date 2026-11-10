import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mono grid min-h-dvh place-items-center px-4 text-[13px]">
      <div className="space-y-3 text-center">
        <p>404: page not found</p>
        <Link href="/" className="link">
          cd ~
        </Link>
      </div>
    </main>
  );
}
