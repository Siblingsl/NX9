import React from 'react';
import { Composition } from 'remotion';
import type { TimelinePayload } from '@nx9/shared';
import { Nx9Episode } from './Nx9Episode';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Nx9Episode"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        component={Nx9Episode as any}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          timeline: {
            version: 2,
            title: 'New Episode',
            fps: 30,
            durationSec: 10,
            aspect: '9:16',
            width: 1080,
            height: 1920,
            tracks: [],
          } as TimelinePayload,
        }}
      />
    </>
  );
};
