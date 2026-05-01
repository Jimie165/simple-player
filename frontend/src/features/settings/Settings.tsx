import PageContainer from '@/components/layout/PageContainer';
import TranscodeSettings from '@/features/settings/TranscodeSettings';
import AboutSection from '@/features/settings/components/AboutSection';
import AppearanceSection from '@/features/settings/components/AppearanceSection';
import AudioOutputSection from '@/features/settings/components/AudioOutputSection';
import GeneralSettingsSection from '@/features/settings/components/GeneralSettingsSection';
import IgnoredDirsSection from '@/features/settings/components/IgnoredDirsSection';
import MusicFoldersSection from '@/features/settings/components/MusicFoldersSection';
import VideoFoldersSection from '@/features/settings/components/VideoFoldersSection';

export default function Settings() {
    return (
        <PageContainer title="设置">
            <div className="w-full pb-20">
                <div className="columns-1 lg:columns-2 gap-6 [&>*]:break-inside-avoid [&>*]:mb-6">
                    <GeneralSettingsSection />
                    <MusicFoldersSection />
                    <VideoFoldersSection />
                    <IgnoredDirsSection />
                    <AudioOutputSection />
                    <AppearanceSection />
                    <TranscodeSettings />
                    <AboutSection />
                </div>
            </div>
        </PageContainer>
    );
}
