# Born to Run Virtual Guestbook

A stylish virtual guestbook for the Bruce Springsteen "Born to Run" exhibit at the Arts & Cultural Center in Long Branch, NJ.

## Features

- 🎸 Rock-themed design inspired by the Born to Run album
- 📝 Simple sign-up with name and email
- 📧 Newsletter subscription checkbox for Arts Center updates
- 👨‍💼 Admin dashboard with daily statistics
- 📊 Export functionality for all data and Mailchimp-ready newsletter subscribers
- 📱 Fully responsive design

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables in `.env`:
```env
JWT_SECRET=your-secret-key-change-this-in-production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=BornToRun2024!
PORT=3000
```

3. Run the server:
```bash
npm start
```

4. Access the application:
- Guestbook: http://localhost:3000
- Admin Panel: http://localhost:3000/admin.html

## Default Admin Credentials

- Username: `admin`
- Password: `BornToRun2024!`

**Important:** Change these credentials before deploying to production!

## Deployment to Vercel

### Option 1: Using Vercel Postgres (Recommended for Production)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy to Vercel:
```bash
vercel
```

3. In Vercel Dashboard:
   - Go to your project settings
   - Navigate to Storage
   - Create a new Postgres database
   - The connection will be automatically configured

4. Set environment variables in Vercel:
   - Go to Settings > Environment Variables
   - Add:
     - `JWT_SECRET`: A strong secret key
     - `ADMIN_USERNAME`: Your admin username
     - `ADMIN_PASSWORD`: Your admin password

### Option 2: Using External Database

You can also use services like:
- Supabase (PostgreSQL)
- PlanetScale (MySQL)
- Neon (PostgreSQL)

Just update the database connection in `server.js` to use the connection string from your chosen provider.

## Export Formats

### All Data Export
Standard CSV with all guestbook entries including:
- Name
- Email
- Newsletter signup status
- Message
- Timestamp

### Newsletter Export (Mailchimp Format)
CSV formatted for direct import into Mailchimp with:
- Email Address
- First Name
- Last Name
- Tags (automatically set to "Born to Run Exhibit")
- Subscribe Date

## Admin Dashboard Features

- **Total Signatures**: Overall count of guestbook entries
- **Newsletter Signups**: Count of users who opted for newsletter
- **Today's Signatures**: Entries from current day
- **This Week**: Entries from last 7 days
- **Daily Chart**: Visual representation of daily signups
- **Export Options**: 
  - All data
  - Newsletter subscribers only (Mailchimp format)
  - Custom date range

## Technologies Used

- Node.js & Express
- SQLite (local) / PostgreSQL (production)
- JWT Authentication
- Chart.js for analytics
- Vanilla JavaScript
- CSS3 with custom animations

## Security Notes

1. Always use HTTPS in production
2. Change default admin credentials
3. Use strong JWT secret
4. Consider rate limiting for API endpoints
5. Regular backups of database

## License

Created for Arts & Cultural Center, Long Branch, NJ