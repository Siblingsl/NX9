import React from 'react';
import { Composition } from 'remotion';
import { Nx9Episode } from './Nx9Episode';

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Nx9Episode"
        component={Nx9Episode}
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
          },
        }}
      />
    </>
  );
};
