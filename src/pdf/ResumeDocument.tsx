import { Document, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { EntryGroup, ResumeLayout } from "./layout";

// Single-column, ATS-friendly resume. Built-in Helvetica keeps every word as selectable text
// and needs no font downloads. Mirrors the layout of MFK's own resume.

const INK = "#111111";
const MUTED = "#333333";

const styles = StyleSheet.create({
  page: { paddingVertical: 32, paddingHorizontal: 40, fontFamily: "Helvetica", fontSize: 9.5, color: INK, lineHeight: 1.3 },
  // Explicit line heights: the page's 1.3 resolves against the 9.5pt body size, which made the
  // 20pt name overlap the headline.
  name: { fontFamily: "Helvetica-Bold", fontSize: 20, lineHeight: 1.2, textAlign: "center" },
  headline: { fontFamily: "Helvetica-Bold", fontSize: 11, lineHeight: 1.3, textAlign: "center", marginTop: 3 },
  contact: { textAlign: "center", marginTop: 3, color: MUTED },
  link: { color: MUTED, textDecoration: "none" },
  section: { marginTop: 10 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11.5,
    borderBottomWidth: 0.8,
    borderBottomColor: INK,
    paddingBottom: 1.5,
    marginBottom: 4,
  },
  row: { flexDirection: "row", justifyContent: "space-between" },
  rowTitle: { flexGrow: 1, flexShrink: 1, paddingRight: 8 },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  date: { flexShrink: 0 },
  group: { marginBottom: 4 },
  blockHeading: { fontFamily: "Helvetica-Oblique", marginTop: 1 },
  bullet: { flexDirection: "row", paddingLeft: 8, marginTop: 1 },
  bulletMark: { width: 9 },
  bulletText: { flex: 1 },
  skillLine: { marginTop: 1 },
});

function Bullets({ items }: { items: string[] }) {
  return (
    <>
      {items.map((text, i) => (
        <View key={i} style={styles.bullet} wrap={false}>
          <Text style={styles.bulletMark}>{"•"}</Text>
          <Text style={styles.bulletText}>{text}</Text>
        </View>
      ))}
    </>
  );
}

function Entry({ group, kind }: { group: EntryGroup; kind: "experience" | "project" }) {
  return (
    <View style={styles.group}>
      <View style={styles.row} wrap={false}>
        <Text style={styles.rowTitle}>
          <Text style={styles.bold}>{group.title}</Text>
          {group.org ? (
            <Text style={styles.italic}>{kind === "experience" ? `, ${group.org}` : `, (${group.org})`}</Text>
          ) : null}
        </Text>
        {group.dateLabel ? <Text style={styles.date}>{group.dateLabel}</Text> : null}
      </View>
      {group.blocks.map((block, i) => (
        <View key={i}>
          {block.heading ? <Text style={styles.blockHeading}>{block.heading}</Text> : null}
          <Bullets items={block.bullets} />
        </View>
      ))}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function ResumeDocument({ layout, title }: { layout: ResumeLayout; title: string }) {
  const { profile } = layout;
  const contact = [profile.phone, profile.email, profile.location].filter(Boolean).join("  |  ");

  return (
    <Document title={title} author={profile.fullName} creator="jobs.fouzan.dev" producer="jobs.fouzan.dev">
      <Page size="A4" style={styles.page}>
        <Text style={styles.name}>{profile.fullName}</Text>
        {profile.headline ? <Text style={styles.headline}>{profile.headline}</Text> : null}
        {contact ? <Text style={styles.contact}>{contact}</Text> : null}
        {profile.links.length ? (
          <Text style={styles.contact}>
            {profile.links.map((link, i) => (
              <Text key={link.url}>
                {i > 0 ? "  |  " : ""}
                <Link src={link.url} style={styles.link}>
                  {link.label}
                </Link>
              </Text>
            ))}
          </Text>
        ) : null}

        {layout.summary ? (
          <Section title="Profile">
            <Text>{layout.summary}</Text>
          </Section>
        ) : null}

        {layout.experience.length ? (
          <Section title="Experience">
            {layout.experience.map((group, i) => (
              <Entry key={i} group={group} kind="experience" />
            ))}
          </Section>
        ) : null}

        {layout.education.length ? (
          <Section title="Education">
            {layout.education.map((e, i) => (
              <View key={i} style={styles.group} wrap={false}>
                <View style={styles.row}>
                  <Text style={[styles.rowTitle, styles.bold]}>{e.institution}</Text>
                  {e.place ? <Text style={styles.date}>{e.place}</Text> : null}
                </View>
                <View style={styles.row}>
                  <Text style={styles.rowTitle}>{e.degree}</Text>
                  {e.dateLabel ? <Text style={styles.date}>{e.dateLabel}</Text> : null}
                </View>
              </View>
            ))}
          </Section>
        ) : null}

        {layout.projects.length ? (
          <Section title="Projects">
            {layout.projects.map((group, i) => (
              <Entry key={i} group={group} kind="project" />
            ))}
          </Section>
        ) : null}

        {layout.skills.length || layout.certifications.length ? (
          <Section title="Skills">
            {layout.skills.map((s) => (
              <Text key={s.category} style={styles.skillLine}>
                <Text style={styles.bold}>{s.category}: </Text>
                {s.items.join(", ")}
              </Text>
            ))}
            {layout.certifications.length ? (
              <Text style={styles.skillLine}>
                <Text style={styles.bold}>Certifications: </Text>
                {layout.certifications.join("; ")}
              </Text>
            ) : null}
          </Section>
        ) : null}
      </Page>
    </Document>
  );
}
