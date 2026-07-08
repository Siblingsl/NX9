import type { BlockDefinition, BlockCategory } from '../types/block';
export declare const BLOCK_CATALOG: BlockDefinition[];
export declare const BLOCK_GROUPS: Record<BlockCategory, {
    title: string;
    items: BlockDefinition[];
}>;
export declare function lookupBlock(kind: string): BlockDefinition | undefined;
