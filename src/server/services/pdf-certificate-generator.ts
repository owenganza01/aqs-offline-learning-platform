// src/server/services/pdf-certificate-generator.ts
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export interface CertificatePdfData {
  learnerName: string;
  courseTitle: string;
  certificateTitle: string;
  issuer: string;
  verificationCode: string;
  issuedAt: Date;
  templateBuffer?: Buffer | null;
}

export async function generatePersonalizedCertificatePdf(data: CertificatePdfData): Promise<Uint8Array> {
  if (data.templateBuffer && data.templateBuffer.length > 0) {
    try {
      return await overlayTemplatePdf(data.templateBuffer, data);
    } catch (err) {
      console.warn('Failed to overlay uploaded PDF template, falling back to generated certificate:', err);
    }
  }

  return await createDefaultCertificatePdf(data);
}

// Overlay learner details onto an instructor-uploaded PDF template
async function overlayTemplatePdf(templateBuffer: Buffer, data: CertificatePdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBuffer);
  const pages = pdfDoc.getPages();
  if (pages.length === 0) {
    throw new Error('Template PDF contains no pages');
  }

  const page = pages[0];
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const navyColor = rgb(0.08, 0.16, 0.3);
  const mutedColor = rgb(0.35, 0.4, 0.48);

  // 1. Learner Name (Centered horizontally at ~48% height)
  const nameSize = 28;
  const nameWidth = fontBold.widthOfTextAtSize(data.learnerName, nameSize);
  page.drawText(data.learnerName, {
    x: Math.max(30, (width - nameWidth) / 2),
    y: height * 0.48,
    size: nameSize,
    font: fontBold,
    color: navyColor,
  });

  // 2. Course Title (Centered below name at ~39% height)
  const courseSize = 16;
  const courseWidth = fontBold.widthOfTextAtSize(data.courseTitle, courseSize);
  page.drawText(data.courseTitle, {
    x: Math.max(30, (width - courseWidth) / 2),
    y: height * 0.39,
    size: courseSize,
    font: fontBold,
    color: navyColor,
  });

  // 3. Issue Date (Bottom Left)
  const dateStr = `Issued: ${data.issuedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`;
  page.drawText(dateStr, {
    x: 45,
    y: 35,
    size: 10,
    font: fontRegular,
    color: mutedColor,
  });

  // 4. Verification Code (Bottom Right)
  const codeStr = `Verification ID: ${data.verificationCode}`;
  const codeWidth = fontMono.widthOfTextAtSize(codeStr, 10);
  page.drawText(codeStr, {
    x: Math.max(width - codeWidth - 45, width / 2),
    y: 35,
    size: 10,
    font: fontMono,
    color: mutedColor,
  });

  return await pdfDoc.save();
}

// Generate an elegant, professional landscape certificate from scratch
async function createDefaultCertificatePdf(data: CertificatePdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();

  // US Letter Landscape: 792 x 612 pt
  const width = 792;
  const height = 612;
  const page = pdfDoc.addPage([width, height]);

  const fontSerifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const fontSerifItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const fontSans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontSansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const navy = rgb(0.08, 0.16, 0.32);
  const ochre = rgb(0.78, 0.54, 0.15);
  const ochreLight = rgb(0.96, 0.93, 0.86);
  const charcoal = rgb(0.18, 0.22, 0.28);
  const muted = rgb(0.45, 0.5, 0.58);
  const creamBg = rgb(0.99, 0.98, 0.96);

  // Background tint
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: creamBg,
  });

  // Outer Decorative Ochre Border
  page.drawRectangle({
    x: 24,
    y: 24,
    width: width - 48,
    height: height - 48,
    borderColor: ochre,
    borderWidth: 3,
  });

  // Inner Navy Border
  page.drawRectangle({
    x: 32,
    y: 32,
    width: width - 64,
    height: height - 64,
    borderColor: navy,
    borderWidth: 1.5,
  });

  // Corner Ornaments
  const cornerSize = 16;
  const corners = [
    { x: 36, y: height - 36 - cornerSize },
    { x: width - 36 - cornerSize, y: height - 36 - cornerSize },
    { x: 36, y: 36 },
    { x: width - 36 - cornerSize, y: 36 },
  ];
  for (const c of corners) {
    page.drawRectangle({
      x: c.x,
      y: c.y,
      width: cornerSize,
      height: cornerSize,
      borderColor: ochre,
      borderWidth: 1,
      color: ochreLight,
    });
  }

  // Header: Issuer Organization
  const issuerText = (data.issuer || 'AFRICA QUANTITATIVE SCIENCES').toUpperCase();
  const issuerSize = 11;
  const issuerWidth = fontSansBold.widthOfTextAtSize(issuerText, issuerSize);
  page.drawText(issuerText, {
    x: (width - issuerWidth) / 2,
    y: height - 85,
    size: issuerSize,
    font: fontSansBold,
    color: ochre,
  });

  // Main Title: Certificate Title
  const titleText = (data.certificateTitle || 'Certificate of Completion').toUpperCase();
  const titleSize = 28;
  const titleWidth = fontSerifBold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, {
    x: (width - titleWidth) / 2,
    y: height - 130,
    size: titleSize,
    font: fontSerifBold,
    color: navy,
  });

  // Decorative Horizontal Ribbon
  const ribbonWidth = 240;
  page.drawLine({
    start: { x: (width - ribbonWidth) / 2, y: height - 146 },
    end: { x: (width + ribbonWidth) / 2, y: height - 146 },
    thickness: 1.5,
    color: ochre,
  });

  // Presentation line
  const presText = 'THIS IS PROUDLY PRESENTED TO';
  const presSize = 10;
  const presWidth = fontSans.widthOfTextAtSize(presText, presSize);
  page.drawText(presText, {
    x: (width - presWidth) / 2,
    y: height - 185,
    size: presSize,
    font: fontSans,
    color: muted,
  });

  // Recipient Learner Name
  const learnerSize = 34;
  const learnerWidth = fontSerifBold.widthOfTextAtSize(data.learnerName, learnerSize);
  page.drawText(data.learnerName, {
    x: (width - learnerWidth) / 2,
    y: height - 240,
    size: learnerSize,
    font: fontSerifBold,
    color: navy,
  });

  // Underline beneath learner name
  const underlineWidth = Math.max(learnerWidth + 60, 320);
  page.drawLine({
    start: { x: (width - underlineWidth) / 2, y: height - 250 },
    end: { x: (width + underlineWidth) / 2, y: height - 250 },
    thickness: 1,
    color: rgb(0.75, 0.78, 0.84),
  });

  // Completion statement
  const stmtText = 'for successfully fulfilling all curriculum requirements and passing the assessments for';
  const stmtSize = 12;
  const stmtWidth = fontSerifItalic.widthOfTextAtSize(stmtText, stmtSize);
  page.drawText(stmtText, {
    x: (width - stmtWidth) / 2,
    y: height - 285,
    size: stmtSize,
    font: fontSerifItalic,
    color: charcoal,
  });

  // Course Title
  const courseSize = 22;
  const courseWidth = fontSerifBold.widthOfTextAtSize(data.courseTitle, courseSize);
  page.drawText(data.courseTitle, {
    x: (width - courseWidth) / 2,
    y: height - 325,
    size: courseSize,
    font: fontSerifBold,
    color: navy,
  });

  // Footer Divider Line
  page.drawLine({
    start: { x: 70, y: 125 },
    end: { x: width - 70, y: 125 },
    thickness: 0.8,
    color: rgb(0.85, 0.87, 0.9),
  });

  // Footer Column 1: Date
  const dateFormatted = data.issuedAt.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  page.drawText('DATE OF ISSUANCE', {
    x: 80,
    y: 100,
    size: 9,
    font: fontSansBold,
    color: muted,
  });
  page.drawText(dateFormatted, {
    x: 80,
    y: 82,
    size: 12,
    font: fontSans,
    color: charcoal,
  });

  // Footer Column 2: Platform Seal / Verified Badge
  const badgeText = 'AUTHENTICATED';
  const badgeWidth = fontSansBold.widthOfTextAtSize(badgeText, 9);
  page.drawRectangle({
    x: (width - 130) / 2,
    y: 70,
    width: 130,
    height: 38,
    borderColor: ochre,
    borderWidth: 1.2,
    color: ochreLight,
  });
  page.drawText(badgeText, {
    x: (width - badgeWidth) / 2,
    y: 92,
    size: 9,
    font: fontSansBold,
    color: ochre,
  });
  const secureText = 'SECURE CERTIFICATE';
  const secureWidth = fontSans.widthOfTextAtSize(secureText, 7.5);
  page.drawText(secureText, {
    x: (width - secureWidth) / 2,
    y: 78,
    size: 7.5,
    font: fontSans,
    color: charcoal,
  });

  // Footer Column 3: Verification Code
  page.drawText('VERIFICATION CODE', {
    x: width - 240,
    y: 100,
    size: 9,
    font: fontSansBold,
    color: muted,
  });
  page.drawText(data.verificationCode, {
    x: width - 240,
    y: 82,
    size: 11,
    font: fontMono,
    color: navy,
  });

  return await pdfDoc.save();
}
