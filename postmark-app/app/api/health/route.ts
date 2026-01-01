import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const userCount = await prisma.user.count();

    return Response.json({
      status: "ok",
      database: "connected",
      userCount,
    });
  } catch (error) {
    console.error("Health check failed", error);

    return new Response(
      JSON.stringify({
        status: "error",
        database: "unreachable",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}











