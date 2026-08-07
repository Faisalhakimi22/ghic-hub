import { PageHeader, PageContent } from "@/components/ui/swiss";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex-1 flex flex-col h-full">
      <PageHeader title="404" description="Page not found" />
      <PageContent className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center max-w-md">
          <div className="text-[120px] font-display font-bold leading-none text-muted">404</div>
          <h2 className="text-2xl font-display font-bold uppercase tracking-wide">Resource Missing</h2>
          <p className="text-muted-foreground text-sm">
            The page you are looking for doesn't exist or has been moved. Check the URL and try again.
          </p>
          <Link href="/" className="px-6 py-2 bg-primary text-primary-foreground font-display tracking-widest uppercase text-sm font-bold mt-4 hover:bg-primary/90 transition-colors">
            Return to Dashboard
          </Link>
        </div>
      </PageContent>
    </div>
  );
}
