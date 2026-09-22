import "dotenv/config";
import { createDb } from "./client";
import { rebuildAllRouteGeometry } from "./routing";

/**
 * Build road geometry for every route.
 * Run after seeding, or whenever the stop network changed outside the app.
 */
async function main() {
  const db = createDb();
  console.log(`routing provider: ${process.env.ROUTING_URL ?? "https://router.project-osrm.org"}`);

  const results = await rebuildAllRouteGeometry(db);
  if (results.length === 0) {
    console.log("no routes to build");
    process.exit(0);
  }

  for (const r of results) {
    const km = (r.distanceM / 1000).toFixed(1);
    const note = r.source === "road" ? `${r.points} точек, ${km} км по дорогам` : `прямые линии, ${km} км`;
    console.log(`${r.routeName}: ${note}${r.error ? ` (${r.error})` : ""}`);
  }

  const straight = results.filter((r) => r.source === "straight").length;
  if (straight > 0) {
    console.log(`\n${straight} маршрутов остались на прямых линиях — проверьте доступность маршрутизатора.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
