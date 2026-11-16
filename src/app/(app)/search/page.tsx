import { SearchResults } from "@/components/SearchResults";

// Results for the search bar: all mail plus matching cards.
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  return <SearchResults key={q} query={q} />;
}
