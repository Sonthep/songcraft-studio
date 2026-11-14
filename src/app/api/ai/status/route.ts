import { connection } from "next/server";
import { getAIStatus } from "@/lib/server/ai/provider";

export async function GET() {
  // Read configuration at request time, never at build time.
  await connection();
  return Response.json(getAIStatus());
}
