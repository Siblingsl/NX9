declare module '@hyperframes/producer' {
  export const producer: {
    render: (opts: {
      entry: string;
      out: string;
      fps?: number;
      width?: number;
      height?: number;
    }) => Promise<{ url: string }>;
  };
}

declare module '@hyperframes/core' {}

declare module '@hyperframes/remotion-adapter' {
  export function mountRemotionComposition(opts: {
    compositionId: string;
    component: any;
    inputProps: Record<string, unknown>;
  }): void;
}
