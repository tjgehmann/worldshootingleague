import { useLocalSearchParams } from 'expo-router';
import { ScrollView, Text } from 'react-native';

import { Empty, Kicker, LargeTitle, Meta } from '@/components/ui';
import { LEGAL, type LegalDocument } from '@/lib/legal';
import { useTheme } from '@/lib/theme';

/**
 * Imprint, privacy and terms, rendered from lib/legal.ts.
 *
 * They sit in the public group deliberately: somebody has to be able to read
 * what they are agreeing to before they have an account, and an imprint that
 * needs a login is not an imprint.
 */
export default function LegalScreen() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const t = useTheme();

  const document = LEGAL[doc as LegalDocument['slug']];
  if (!document) return <Empty text="No such document." />;

  return (
    <ScrollView
      style={{ backgroundColor: t.colors.ground }}
      contentContainerStyle={{
        paddingHorizontal: t.space.xl,
        paddingTop: t.space.md,
        paddingBottom: t.space.xxl,
      }}
    >
      <Kicker>World Shooting League</Kicker>
      <LargeTitle>{document.title}</LargeTitle>
      <Text
        style={{
          color: t.colors.inkMuted,
          fontSize: 15,
          lineHeight: 24,
        }}
      >
        {document.body}
      </Text>
      <Meta style={{ marginTop: t.space.xl }}>Version {document.updated}</Meta>
    </ScrollView>
  );
}
