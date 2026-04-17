/** Shared ref so TopBar / auto-save can request current Excalidraw scene JSON */
export const sceneSerializerRef: { current: () => string } = {
  current: () => '{}',
};

/** Shared ref so HistoryPanel can imperatively restore a scene JSON to Excalidraw */
export const sceneRestorerRef: { current: (json: string) => void } = {
  current: () => {},
};
