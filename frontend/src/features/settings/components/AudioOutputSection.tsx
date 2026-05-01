import { useEffect, useState } from 'react';
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { MdCheck, MdExpandMore, MdSpeaker } from 'react-icons/md';
import clsx from 'clsx';

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
        ? audioOutputs.some((device) => device.name === preferredDevice)
        : true;
    const selectedAudioOutput = preferredDeviceAvailable ? (preferredDevice ?? '') : '';
    const selectedAudioOutputLabel = selectedAudioOutput
        ? selectedAudioOutput
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
        <section className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary uppercase tracking-wider px-1">
                <MdSpeaker className="text-lg" />
                <span>音频输出</span>
            </div>

            <div className="rounded-2xl border border-outline-variant/30 bg-surface-container-high p-4 space-y-3">
                <div className="flex flex-col gap-1">
                    <span className="text-base font-medium text-on-surface">输出设备</span>
                    <span className="text-sm text-on-surface-variant">
                        选择「跟随系统默认」时，切换 Windows 默认输出会自动跟随。
                    </span>
                </div>
                <Listbox
                    value={selectedAudioOutput}
                    onChange={handleAudioOutputChange}
                >
                    {({ open }) => (
                        <div className="relative">
                            <ListboxButton
                                className={clsx(
                                    "flex items-center justify-between w-full px-4 py-2.5 rounded-xl bg-surface-container text-sm text-on-surface border transition-all duration-200 focus:outline-none",
                                    open
                                        ? "border-primary/50 ring-1 ring-primary/20 rounded-b-none"
                                        : "border-outline-variant/30 hover:border-primary/30"
                                )}
                            >
                                <span className="truncate">
                                    {selectedAudioOutputLabel}
                                </span>
                                <MdExpandMore
                                    className={clsx(
                                        "text-lg text-on-surface-variant transition-transform duration-300",
                                        open && "rotate-180"
                                    )}
                                />
                            </ListboxButton>

                            <AnimatePresence>
                                {open && (
                                    <ListboxOptions
                                        static
                                        anchor="bottom"
                                        as={motion.div}
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } }}
                                        exit={{ opacity: 0, y: -10, transition: { duration: 0.2, ease: "easeOut" } }}
                                        className="z-50 w-[var(--button-width)] mt-[-1px] rounded-b-xl border border-primary/50 border-t-0 bg-surface-container-high shadow-xl focus:outline-none overflow-hidden"
                                    >
                                        <div className="py-1 max-h-60 overflow-y-auto scrollbar-hidden">
                                            <ListboxOption
                                                value=""
                                                className="group flex items-center justify-between px-4 py-2 text-sm cursor-pointer data-[focus]:bg-primary/10 data-[selected]:text-primary"
                                            >
                                                <div className="flex flex-col">
                                                    <span>跟随系统默认</span>
                                                    {activeDevice && (
                                                        <span className="text-[10px] text-on-surface-variant opacity-70">
                                                            当前：{activeDevice}
                                                        </span>
                                                    )}
                                                </div>
                                                {!selectedAudioOutput && <MdCheck className="text-primary" />}
                                            </ListboxOption>

                                            {audioOutputs.map((d) => (
                                                <ListboxOption
                                                    key={d.name}
                                                    value={d.name}
                                                    className="group flex items-center justify-between px-4 py-2 text-sm cursor-pointer data-[focus]:bg-primary/10 data-[selected]:text-primary"
                                                >
                                                    <div className="flex flex-col">
                                                        <span>{d.name}</span>
                                                        {d.is_system_default && (
                                                            <span className="text-[10px] text-on-surface-variant opacity-70">
                                                                系统默认设备
                                                            </span>
                                                        )}
                                                    </div>
                                                    {selectedAudioOutput === d.name && <MdCheck className="text-primary" />}
                                                </ListboxOption>
                                            ))}
                                        </div>
                                    </ListboxOptions>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </Listbox>
            </div>
        </section>
    );
}
