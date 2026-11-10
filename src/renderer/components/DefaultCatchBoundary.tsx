import { useEffect } from "react";
import {
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useQueryErrorResetBoundary } from "@tanstack/react-query";
import { isCushnError } from "@shared/errors";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

// A CushnError carries a user-facing message from main, so it is shown as is.
export function DefaultCatchBoundary({ error }: ErrorComponentProps) {
  const router = useRouter();
  const queryErrorResetBoundary = useQueryErrorResetBoundary();

  useEffect(() => {
    // Lets useSuspenseQuery refetch on retry instead of rethrowing the cached error.
    queryErrorResetBoundary.reset();
  }, [queryErrorResetBoundary]);

  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyTitle>Something went wrong</EmptyTitle>
        <EmptyDescription>
          {isCushnError(error)
            ? error.message
            : "Try again, or restart the app if the problem persists."}
        </EmptyDescription>
      </EmptyHeader>
      {import.meta.env.DEV && !isCushnError(error) && (
        <pre className="text-destructive max-w-2xl overflow-auto text-left text-xs whitespace-pre-wrap select-text">
          {error instanceof Error ? error.message : String(error)}
        </pre>
      )}
      <EmptyContent className="flex-row justify-center">
        <Button size="sm" onClick={() => router.invalidate()}>
          Try again
        </Button>
        <Button
          render={<Link to="/dashboard" />}
          variant="secondary"
          size="sm"
        >
          Go to dashboard
        </Button>
      </EmptyContent>
    </Empty>
  );
}
