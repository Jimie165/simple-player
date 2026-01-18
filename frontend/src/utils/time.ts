/**
 * 将秒数格式化为 mm:ss
 * @param seconds 总秒数
 * @returns 格式化后的字符串 (例如 "03:45")
 */
export const formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
};