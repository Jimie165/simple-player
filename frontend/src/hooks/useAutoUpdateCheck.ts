import { useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';

import { useUpdateStore } from '@/store/useUpdateStore';

export function useAutoUpdateCheck() {
    const autoCheckEnabled = useUpdateStore(state => state.autoCheckEnabled);
    const checkForUpdates = useUpdateStore(state => state.checkForUpdates);
    const hasChecked = useRef(false);

    useEffect(() => {
        if (!autoCheckEnabled || hasChecked.current) return;
        hasChecked.current = true;

        void checkForUpdates()
            .then(result => {
                if (result.updateAvailable) {
                    toast(`新版本 v${result.latestRelease.version} 可用`, {
                        id: 'auto-update-check',
                    });
                }
            })
            .catch(() => {
                // 启动时静默处理网络或尚未发布 Release 的情况，手动检查会显示具体错误。
            });
    }, [autoCheckEnabled, checkForUpdates]);
}
