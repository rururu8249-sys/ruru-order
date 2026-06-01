import EventClawOverlayClient from "@/components/event-claw/EventClawOverlayClient";

type OverlayPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

export default async function EventClawOverlayPage({ searchParams }: OverlayPageProps) {
  const params = await Promise.resolve(searchParams || {});
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] || "" : rawToken || "";

  return <EventClawOverlayClient initialToken={token} />;
}
