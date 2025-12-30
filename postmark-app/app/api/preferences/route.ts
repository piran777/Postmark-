import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";

type SavedView = {
  name: string;
  domain: string;
  providers: string[];
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return Response.json({ error: "userId is required" }, { status: 400 });
  }

  const pref = await prisma.userPreference.findUnique({
    where: { userId },
  });

  return Response.json({
    userId,
    savedViews: (pref?.savedViews as SavedView[]) ?? [],
  });
}

export async function POST(req: NextRequest) {
  try {
    const { userId, view } = (await req.json()) as {
      userId?: string;
      view?: SavedView;
    };
    if (!userId || !view?.name) {
      return Response.json(
        { error: "userId and view.name are required" },
        { status: 400 }
      );
    }

    const existing = await prisma.userPreference.findUnique({
      where: { userId },
    });

    let savedViews: SavedView[] = (existing?.savedViews as SavedView[]) ?? [];
    const idx = savedViews.findIndex(
      (v) => v.name.toLowerCase() === view.name.toLowerCase()
    );
    if (idx >= 0) {
      savedViews[idx] = view;
    } else {
      savedViews.push(view);
    }

    const updated = await prisma.userPreference.upsert({
      where: { userId },
      create: {
        userId,
        savedViews,
      },
      update: {
        savedViews,
      },
    });

    return Response.json({
      userId,
      savedViews: updated.savedViews,
    });
  } catch (error) {
    console.error("POST /api/preferences failed", error);
    return Response.json(
      { error: "Unable to save view." },
      { status: 500 }
    );
  }
}







