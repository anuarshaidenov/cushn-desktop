import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: App,
  beforeLoad: async () => {
    throw redirect({ to: "/dashboard/home" });
  },
});

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900"></div>
  );
}
