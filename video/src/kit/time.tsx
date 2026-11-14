import { createContext, useContext, type ReactNode } from "react";
import { useCurrentFrame } from "remotion";

const Ctx = createContext<{ from: number }>({ from: 0 });

/** Inside a scene's Sequence, `useCurrentFrame()` is local. Wrap the scene so its code can use absolute frames. */
export function SceneClock({ from, children }: { from: number; children: ReactNode }) {
  return <Ctx.Provider value={{ from }}>{children}</Ctx.Provider>;
}

/** Absolute composition frame (local frame + the scene's start). */
export function useT() {
  return useCurrentFrame() + useContext(Ctx).from;
}

export const useSceneFrom = () => useContext(Ctx).from;
