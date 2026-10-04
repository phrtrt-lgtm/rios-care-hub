import React from "react";
import { Composition } from "remotion";
import { RiosFluxo } from "./RiosFluxo";

export const Raiz: React.FC = () => (
  <Composition id="RiosFluxo" component={RiosFluxo} durationInFrames={300} fps={30} width={1280} height={448} />
);
