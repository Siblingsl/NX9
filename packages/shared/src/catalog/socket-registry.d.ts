import type { SocketKind, SocketProfile } from '../types/block';
export declare const SOCKET_REGISTRY: Record<string, SocketProfile>;
export declare const SOCKET_COLORS: Record<SocketKind, string>;
export declare const SOCKET_LABELS: Record<SocketKind, string>;
export declare function resolveEmits(kind: string, data?: Record<string, unknown>): SocketKind[];
export declare function resolveAccepts(kind: string): SocketKind[];
export declare function socketsCompatible(sourceEmits: SocketKind[], targetAccepts: SocketKind[]): boolean;
export declare function validateLink(sourceKind: string, targetKind: string, sourceData?: Record<string, unknown>): boolean;
