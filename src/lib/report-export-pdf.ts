import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

export async function exportElementAsPdf(
  element: HTMLElement,
  filename: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.('Capturando relatório...');

  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  element.style.width = '1024px';
  element.style.maxWidth = '1024px';

  await new Promise(r => setTimeout(r, 150));

  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 8;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const sections = Array.from(element.querySelectorAll('[data-pdf-section]')) as HTMLElement[];
    if (sections.length === 0) sections.push(element);

    let currentY = margin;
    const gap = 2;

    for (let i = 0; i < sections.length; i++) {
      onProgress?.(`Capturando seção ${i + 1} de ${sections.length}...`);
      const section = sections[i];
      const canvas = await html2canvas(section, {
        scale: 1.5, useCORS: true, allowTaint: true,
        backgroundColor: '#ffffff', logging: false, imageTimeout: 5000,
      });

      const imgW = canvas.width;
      const imgH = canvas.height;
      const scaleFactor = usableW / imgW;
      const sectionH_mm = imgH * scaleFactor;
      const remainingSpace = pageH - margin - currentY;

      if (sectionH_mm > remainingSpace && currentY > margin + 1) {
        pdf.addPage();
        currentY = margin;
      }

      if (sectionH_mm > usableH) {
        const usableH_px = usableH / scaleFactor;
        let sliceStart = 0;
        while (sliceStart < imgH) {
          const sliceHeight = Math.min(usableH_px, imgH - sliceStart);
          const sliceH_mm = sliceHeight * scaleFactor;
          if (sliceStart > 0) { pdf.addPage(); currentY = margin; }
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = imgW;
          sliceCanvas.height = Math.ceil(sliceHeight);
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.drawImage(canvas, 0, sliceStart, imgW, sliceHeight, 0, 0, imgW, Math.ceil(sliceHeight));
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.85), 'JPEG', margin, currentY, usableW, sliceH_mm);
          currentY += sliceH_mm + gap;
          sliceStart += sliceHeight;
        }
      } else {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', margin, currentY, usableW, sectionH_mm);
        currentY += sectionH_mm + gap;
      }
    }

    onProgress?.('Salvando PDF...');
    pdf.save(filename);
  } finally {
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
  }
}
