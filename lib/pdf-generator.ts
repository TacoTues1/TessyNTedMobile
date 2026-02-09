import * as Print from 'expo-print';
import { shareAsync } from 'expo-sharing';

export async function generateStatementPDF(tenant: any, payments: any[], period: any) {
    const html = `
    <html>
      <head>
        <style>
          body { font-family: Helvetica, sans-serif; padding: 40px; }
          h1 { text-align: center; }
          .header { margin-bottom: 40px; border-bottom: 2px solid black; padding-bottom: 20px; }
          .row { display: flex; justify-content: space-between; margin-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
        </style>
      </head>
      <body>
        <div class="header">
            <h1>EaseRent</h1>
            <p style="text-align:center;">Statement of Account</p>
        </div>
        <div class="details">
            <p><strong>Tenant:</strong> ${tenant.first_name} ${tenant.last_name}</p>
            <p><strong>Email:</strong> ${tenant.email}</p>
            <p><strong>Period:</strong> ${period.monthYear}</p>
        </div>
        <table>
            <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Status</th>
            </tr>
            ${payments.map((p: any) => `
                <tr>
                    <td>${new Date(p.created_at).toLocaleDateString()}</td>
                    <td>${p.title || 'Rent Payment'}</td>
                    <td>₱${p.amount}</td>
                    <td>${p.status}</td>
                </tr>
            `).join('')}
        </table>
      </body>
    </html>
    `;

    const { uri } = await Print.printToFileAsync({ html });
    await shareAsync(uri);
}