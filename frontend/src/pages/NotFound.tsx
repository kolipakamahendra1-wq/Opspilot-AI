import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">404</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Nothing to investigate here.</h1>
      <Link to="/" className="mt-6 text-sm text-primary hover:underline">Back to OpsPilot →</Link>
    </div>
  );
}
