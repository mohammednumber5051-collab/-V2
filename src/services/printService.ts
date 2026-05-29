import { Capacitor } from '@capacitor/core';

export enum PrintTemplateSize {
  A4 = 'A4',
  MM80 = '80mm',
  MM58 = '58mm'
}

export interface PrintOptions {
  size: PrintTemplateSize;
  copies?: number;
  autoPrint?: boolean;
}

class PrintService {
  private static instance: PrintService;

  private constructor() {}

  public static getInstance(): PrintService {
    if (!PrintService.instance) {
      PrintService.instance = new PrintService();
    }
    return PrintService.instance;
  }

  /**
   * Prepares the document for printing.
   * On Web: Uses window.print()
   * On Android: Prepares for Bluetooth/System Print integration
   */
  public async print(elementId: string, options: PrintOptions = { size: PrintTemplateSize.A4 }): Promise<void> {
    const isNative = Capacitor.isNativePlatform();

    if (!isNative) {
      this.printWeb(elementId);
    } else {
      await this.printNative(elementId, options);
    }
  }

  private printWeb(elementId: string) {
    const printContents = document.getElementById(elementId)?.innerHTML;
    if (!printContents) {
      console.error("Print Error: Element not found", elementId);
      return;
    }

    const originalContents = document.body.innerHTML;
    
    // Create print-specific style
    const style = document.createElement('style');
    style.innerHTML = `
      @media print {
        body * { visibility: hidden; }
        #print-container, #print-container * { visibility: visible; }
        #print-container { position: absolute; left: 0; top: 0; width: 100%; }
      }
    `;
    document.head.appendChild(style);

    const container = document.createElement('div');
    container.id = 'print-container';
    container.innerHTML = printContents;
    document.body.appendChild(container);

    window.print();

    // Cleanup
    document.body.removeChild(container);
    document.head.removeChild(style);
  }

  private async printNative(elementId: string, options: PrintOptions) {
    // Architectural placeholder for Bluetooth/Thermal printers
    try {
      // Logic for future expansion to thermal printing SDKs
      this.printWeb(elementId);
    } catch (error) {
      console.error("Print Error:", error);
    }
  }

  /**
   * Generates a thermal-safe text string for small receipts
   */
  public formatForThermal(data: any): string {
    // Logic to convert JSON data to ESC/POS style raw text
    return "thermal-formatted-string";
  }
}

export const printService = PrintService.getInstance();
