export interface VideoMetadata {
    id: number;
    path: string;
    title: string;
    duration: number;
    size?: number;
    width?: number;
    height?: number;
    frame_rate?: number;
    channels?: number;
    thumbnail_path?: string;

    is_favorite: boolean;
    play_count: number;
    last_played_at?: string;

    folder_id?: number;
    status: string;

    created_at: string;
    updated_at: string;
}
