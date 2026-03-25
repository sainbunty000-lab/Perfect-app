import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export async function exportToPDF(elementId: string, filename: string = "Dhanush-Report.pdf") {
  const element = document.getElementById(elementId);
  if (!element) return;

  try {
    // Add a class temporarily to fix styling for print if needed
    element.classList.add('pdf-exporting');
    
    const canvas = await html2canvas(element, {
      scale: 2, // High resolution
      useCORS: true,
      backgroundColor: "#0F172A", // match our dark background
      windowWidth: 1200,
    });
    
    element.classList.remove('pdf-exporting');

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save(filename);
  } catch (error) {
    console.error("PDF Export failed", error);
  }
}
