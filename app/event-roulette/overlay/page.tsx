import EventRouletteOverlayClient from "@/components/event-roulette/EventRouletteOverlayClient";

type OverlayPageProps = {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
};

export const dynamic = "force-dynamic";

export default async function EventRouletteOverlayPage({ searchParams }: OverlayPageProps) {
  const params = await Promise.resolve(searchParams || {});
  const rawToken = params.token;
  const token = Array.isArray(rawToken) ? rawToken[0] || "" : rawToken || "";

  return <EventRouletteOverlayClient initialToken={token} />;
}
