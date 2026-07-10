import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { TimelineClip } from '@nx9/shared';

interface SubtitleClipProps {
  clip: TimelineClip;
}

export const SubtitleClip: React.FC<SubtitleClipProps> = ({ clip }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!clip.text) return null;

  const fadeIn = Math.min(10, Math.round(0.3 * fps));
  const opacity = interpolate(frame, [0, fadeIn], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        paddingBottom: '8%',
      }}
    >
      <div
        style={{
          opacity,
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          fontSize: Math.round(28),
          padding: '8px 24px',
          borderRadius: 8,
          textAlign: 'center',
          maxWidth: '90%',
        }}
      >
        {clip.text}
      </div>
    </AbsoluteFill>
  );
};
