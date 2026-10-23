import { viewMotion } from '@/utils/viewTransition';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { IconType } from 'react-icons';
import { MdFolder, MdInfoOutline, MdMemory, MdPalette, MdTune } from 'react-icons/md';
import clsx from 'clsx';

import PageContainer from '@/components/layout/PageContainer';
import TranscodeSettings from '@/features/settings/TranscodeSettings';
import AboutSection from '@/features/settings/components/AboutSection';
import AppearanceSection from '@/features/settings/components/AppearanceSection';
import AudioOutputSection from '@/features/settings/components/AudioOutputSection';
import GeneralSettingsSection from '@/features/settings/components/GeneralSettingsSection';
import IgnoredDirsSection from '@/features/settings/components/IgnoredDirsSection';
import MusicFoldersSection from '@/features/settings/components/MusicFoldersSection';
import VideoFoldersSection from '@/features/settings/components/VideoFoldersSection';

type SettingsTab = 'general' | 'appearance' | 'files' | 'advanced' | 'about';

const TABS: { id: SettingsTab; label: string; icon: IconType }[] = [
    { id: 'general', label: '通用', icon: MdTune },
    { id: 'appearance', label: '外观', icon: MdPalette },
    { id: 'files', label: '文件', icon: MdFolder },
    { id: 'advanced', label: '高级', icon: MdMemory },
    { id: 'about', label: '关于', icon: MdInfoOutline },
];

export default function Settings() {
    const [activeTab, setActiveTab] = useState<SettingsTab>('general');

    return (
        <PageContainer title="设置">
            <div className="w-full pb-20">
                {/* 图标分类栏 */}
                <div className="mb-8 flex justify-center">
                    <div role="tablist" aria-label="设置分类" className="settings-glass inline-flex gap-1 rounded-2xl p-1">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            const selected = tab.id === activeTab;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={selected}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={clsx(
                                        'relative flex w-18 flex-col items-center gap-0.5 rounded-xl px-2 pb-1.5 pt-2 text-[11px] font-medium transition-colors',
                                        selected ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'
                                    )}
                                >
                                    {selected && (
                                        <motion.span
                                            layoutId="settings-tab-indicator"
                                            className="absolute inset-0 rounded-xl bg-on-surface/8"
                                            transition={{ type: 'spring', duration: 0.35, bounce: 0.18 }}
                                        />
                                    )}
                                    <Icon className="relative text-[22px]" />
                                    <span className="relative">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                        key={activeTab}
                        role="tabpanel"
                        {...viewMotion}
                        className="mx-auto w-full max-w-170 space-y-7"
                    >
                        {activeTab === 'general' && (
                            <>
                                <GeneralSettingsSection />
                                <AudioOutputSection />
                            </>
                        )}
                        {activeTab === 'appearance' && <AppearanceSection />}
                        {activeTab === 'files' && (
                            <>
                                <MusicFoldersSection />
                                <VideoFoldersSection />
                                <IgnoredDirsSection />
                            </>
                        )}
                        {activeTab === 'advanced' && <TranscodeSettings />}
                        {activeTab === 'about' && <AboutSection />}
                    </motion.div>
                </AnimatePresence>
            </div>
        </PageContainer>
    );
}
