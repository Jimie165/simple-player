import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';

import { SettingsGroup, SettingsPopup, SettingsRow } from '@/features/settings/components/SettingsControls';
import { audioService, type AudioOutputInfo } from '@/services/audioService';
import { useAudioOutputStore } from '@/store/useAudioOutputStore';

async function fetchAudioOutputs() {
    return audioService.listAudioOutputs();
}

export default function AudioOutputSection() {
    const preferredDevice = useAudioOutputStore((s) => s.preferredDevice);
    const activeDevice = useAudioOutputStore((s) => s.activeDevice);
    const setPreferredDevice = useAudioOutputStore((s) => s.setPreferredDevice);
    const [audioOutputs, setAudioOutputs] = useState<AudioOutputInfo[]>([]);

    const preferredDeviceAvailable = preferredDevice
        ? audioOutputs.some((device) => device.id === preferredDevice)
        : true;
    const selectedAudioOutput = preferredDeviceAvailable ? (preferredDevice ?? '') : '';
    const selectedAudioOutputLabel = selectedAudioOutput
        ? audioOutputs.find((device) => device.id === selectedAudioOutput)?.name ?? selectedAudioOutput
        : `跟随系统默认${activeDevice ? `（当前：${activeDevice}）` : ''}`;

    const reloadAudioOutputs = async () => {
        try {
            const list = await fetchAudioOutputs();
            setAudioOutputs(list);
        } catch (e) {
            console.error('Failed to load audio outputs', e);
        }
    };

    useEffect(() => {
        let cancelled = false;

        fetchAudioOutputs()
            .then((list) => {
                if (!cancelled) {
                    setAudioOutputs(list);
                }
            })
            .catch((e) => {
                console.error('Failed to load audio outputs', e);
            });

        return () => {
            cancelled = true;
        };
    }, [activeDevice]);

    const handleAudioOutputChange = async (value: string) => {
        try {
            await setPreferredDevice(value === '' ? null : value);
            await reloadAudioOutputs();
        } catch (e: unknown) {
            toast.error(typeof e === 'string' ? e : e instanceof Error ? e.message : '切换音频输出失败');
        }
    };

    if (audioOutputs.length === 0) {
        return null;
    }

    return (
        <SettingsGroup title="音频输出" footer="选择「跟随系统默认」时，切换 Windows 默认输出会自动跟随。">
            <SettingsRow label="输出设备">
                <SettingsPopup
                    label="输出设备"
                    value={selectedAudioOutput}
                    onChange={handleAudioOutputChange}
                    buttonLabel={selectedAudioOutputLabel}
                    options={[
                        {
                            value: '',
                            label: '跟随系统默认',
                            description: activeDevice ? `当前：${activeDevice}` : undefined,
                        },
                        ...audioOutputs.map((d) => ({
                            value: d.id,
                            label: d.name,
                            description: d.is_system_default ? '系统默认设备' : undefined,
                        })),
                    ]}
                />
            </SettingsRow>
        </SettingsGroup>
    );
}
