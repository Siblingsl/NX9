import { memo } from 'react';
import { type NodeProps } from '@xyflow/react';
import { useStoryboardDesk } from './storyboard-desk/use-storyboard-desk';
import './storyboard-desk.css';
import './storyboard-desk.v2.css';

function StoryboardDeskBlock(props: NodeProps) {
  return useStoryboardDesk(props);
}

export default memo(StoryboardDeskBlock);
