/** Shared ref so TopBar / auto-save can request current Excalidraw scene JSON */
export const sceneSerializerRef: { current: () => string } = {
  current: () => '{}',
};
