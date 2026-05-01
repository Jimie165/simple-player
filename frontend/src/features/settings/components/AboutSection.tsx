import { useEffect, useState } from 'react';
import { getName, getVersion } from '@tauri-apps/api/app';

export default function AboutSection() {
    const [appVersion, setAppVersion] = useState('');
    const [appName, setAppName] = useState('');

    useEffect(() => {
        const fetchAppInfo = async () => {
            try {
                const name = await getName();
                const version = await getVersion();
                setAppName(name);
                setAppVersion(version);
            } catch (error) {
                console.error('Failed to get app info', error);
            }
        };
        fetchAppInfo();
    }, []);

    return (
        <section className="rounded-2xl bg-surface-container-high p-6 border border-outline-variant/30">
            <h3 className="text-lg font-semibold mb-2 text-on-surface">关于 {appName || 'Simple Player'}</h3>
            <p className="text-sm text-on-surface-variant leading-relaxed">
                这是一个基于 Tauri v2 和 React 构建的本地音乐播放器。
            </p>
            <div className="mt-4 flex gap-4 text-xs text-on-surface-variant/70">
                <span>Version: {appVersion}</span>
                <span>•</span>
                <span>Made by Jimie165</span>
            </div>
        </section>
    );
}
