import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

/**
 * Exporta o elemento como PDF A4, fatiando por seções marcadas com
 * `data-pdf-section`. Estratégia para evitar cortes feios:
 *  - Cada seção é capturada individualmente e nunca é dividida no meio
 *    se couber em uma página.
 *  - Se uma seção for maior que uma página inteira, ela é fatiada em
 *    blocos do tamanho da página com pequena sobreposição visual mínima.
 *  - Lookahead: se a próxima seção não couber no espaço restante,
 *    quebra de página antes dela em vez de empurrar para o limite.
 */
export async function exportElementAsPdf(
  element: HTMLElement,
  filename: string,
  onProgress?: (msg: string) => void
): Promise<void> {
  onProgress?.('Capturando relatório...');

  const originalWidth = element.style.width;
  const originalMaxWidth = element.style.maxWidth;
  // Largura fixa para captura — garante consistência entre desktop/mobile
  const captureWidth = 1100;
  element.style.width = `${captureWidth}px`;
  element.style.maxWidth = `${captureWidth}px`;

  // Aguarda reflow + reidratação dos gráficos recharts
  await new Promise(r => setTimeout(r, 250));

  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageW = pdf.internal.pageSize.getWidth();   // 210
    const pageH = pdf.internal.pageSize.getHeight();  // 297
    const margin = 10;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;
    const gap = 3;

    const sections = Array.from(element.querySelectorAll('[data-pdf-section]')) as HTMLElement[];
    if (sections.length === 0) sections.push(element);

    let currentY = margin;
    let isFirstSection = true;

    for (let i = 0; i < sections.length; i++) {
      onProgress?.(`Renderizando ${i + 1}/${sections.length}...`);
      const section = sections[i];

      const canvas = await html2canvas(section, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        imageTimeout: 8000,
        windowWidth: captureWidth,
      });

      const imgW = canvas.width;
      const imgH = canvas.height;
      const scaleFactor = usableW / imgW;
      const sectionH_mm = imgH * scaleFactor;

      // Espaço restante na página atual
      const remainingSpace = pageH - margin - currentY;

      // Se NÃO for a primeira seção e ela couber inteira numa página, mas
      // não couber no espaço restante, quebra antes dela.
      if (!isFirstSection && sectionH_mm <= usableH && sectionH_mm > remainingSpace) {
        pdf.addPage();
        currentY = margin;
      }

      if (sectionH_mm > usableH) {
        // Seção maior que uma página inteira — precisa fatiar.
        // Se ainda há espaço significativo na página atual, comece nova página
        // para dar espaço total à seção (fica mais limpo visualmente).
        if (!isFirstSection && remainingSpace < usableH * 0.6) {
          pdf.addPage();
          currentY = margin;
        }

        const usableH_px = usableH / scaleFactor;
        let sliceStart = 0;
        let firstSlice = true;

        while (sliceStart < imgH) {
          const sliceHeight = Math.min(usableH_px, imgH - sliceStart);
          const sliceH_mm = sliceHeight * scaleFactor;

          if (!firstSlice) {
            pdf.addPage();
            currentY = margin;
          } else if (currentY > margin + 1) {
            // primeira fatia mas já há conteúdo na página — nova página
            pdf.addPage();
            currentY = margin;
          }

          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = imgW;
          sliceCanvas.height = Math.ceil(sliceHeight);
          const ctx = sliceCanvas.getContext('2d')!;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
          ctx.drawImage(
            canvas,
            0, sliceStart, imgW, sliceHeight,
            0, 0, imgW, Math.ceil(sliceHeight),
          );
          pdf.addImage(
            sliceCanvas.toDataURL('image/jpeg', 0.9),
            'JPEG', margin, currentY, usableW, sliceH_mm,
          );
          currentY += sliceH_mm + gap;
          sliceStart += sliceHeight;
          firstSlice = false;
        }
      } else {
        // Cabe inteira — adiciona sem cortar
        pdf.addImage(
          canvas.toDataURL('image/jpeg', 0.9),
          'JPEG', margin, currentY, usableW, sectionH_mm,
        );
        currentY += sectionH_mm + gap;
      }

      isFirstSection = false;
    }

    onProgress?.('Salvando PDF...');
    pdf.save(filename);
  } finally {
    element.style.width = originalWidth;
    element.style.maxWidth = originalMaxWidth;
  }
}
