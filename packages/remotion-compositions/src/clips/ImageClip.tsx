import React from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { TimelineClip } from '@nx9/shared';

interface ImageClipProps {
  clip: TimelineClip;
}

export const ImageClip: React.FC<ImageClipProps> = ({ clip }) => {
  return (
    <AbsoluteFill>
      <Img
        src={clip.assetUrl}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </AbsoluteFill>
  );
};
