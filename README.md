# ToursPostgreSQL

Welcome to the **ToursPostgreSQL** project! A high-performance, feature-rich, and robust RESTful API built with **Node.js**, **Express**, **PostgreSQL**, and **Prisma ORM**. This backend serves as the core engine for a tours management system, handling everything from user authentication to geospatial tour searches and automated review calculations.

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Activities/Bullseye.png" alt="Bullseye" width="25" height="25" /> Project Overview

ToursPostgreSQL enables developers and administrators to:

- **Manage Tours:** Full CRUD operations with advanced filtering, sorting, field limiting, and pagination using Prisma.
- **Geospatial Searches:** Find tours within a specific radius of a location or calculate distances to tours from any point using PostgreSQL's native math (`$queryRaw` and Haversine formula).
- **Advanced Authentication:** Secure login/signup system with JWT, password reset via email, and role-based access control (Admin, Lead-Guide, Guide, User).
- **Review System:** Integrated review and rating system with automatic average rating calculation for tours upon creation, update, or deletion of a review.
- **User Profiles:** Users can manage their profiles, upload avatars (processed with Sharp), and update account settings.
- **Security & Performance:** Protection against XSS and HPP. Includes rate limiting and secure HTTP headers.

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Rocket.png" alt="Rocket" width="25" height="25" /> Features

- **Factory Pattern:** Clean and DRY controller logic using a generic `handlerFactory` for common CRUD operations on all models.
- **Advanced Querying:** Powerful `APIFeatures` class for complex URL query string handling and building Prisma spec objects.
- **Image Processing:** Automated image resizing and conversion to high-performance **WebP** format using **Sharp**.
- **Email Integration:** Transactional emails for password resets using **Nodemailer**.
- **Data Aggregation:** Complex raw SQL aggregation pipelines for tour statistics and monthly scheduling plans.
- **Security First:** Implements **Helmet** for headers, **Express-Rate-Limit** for DoS protection, and custom data sanitization.

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Hammer%20and%20Wrench.png" alt="Hammer and Wrench" width="25" height="25" /> Technologies Used

- **Node.js** (Runtime Environment)
- **Express.js** (Web Framework)
- **PostgreSQL & Prisma ORM** (Database & ORM)
- **JSON Web Token (JWT)** (Authentication)
- **Bcrypt** (Password Hashing)
- **Multer** (File Uploads)
- **Sharp** (Image Processing)
- **Nodemailer** (Email Service)
- **Validator.js** (Data Validation)

## <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Objects/Desktop%20Computer.png" alt="Desktop Computer" width="25" height="25" /> Setup & Installation

To run the project locally, follow these steps:

```bash
# Clone the repository
git clone https://github.com/ozandmrcn/ToursPostgreSQL.git

# Navigate to the project folder
cd ToursPostgreSQL

# Install required dependencies
npm install

# Setup Prisma and push the schema to your PostgreSQL database
npx prisma migrate dev --name init

# Import seed data (optional, imports 20 users, 9 tours, 60 reviews)
npm run import

# Start the development server (using nodemon)
npm start
```

### ⚙️ Environment Variables (.env Setup)

Create a `.env` file in the root directory and define the following variables:

```env
# Database Configuration
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/tours_db?schema=public

# Server Configuration
PORT=4000
NODE_ENV=development

# JWT Authentication
JWT_SECRET=your_super_secret_key_here
JWT_EXPIRES_IN=30d
JWT_COOKIE_EXPIRES_IN=30

# Email Service (e.g., Mailtrap for testing)
EMAIL_HOST=sandbox.smtp.mailtrap.io
EMAIL_PORT=2525
EMAIL_USER=your_mailtrap_user
EMAIL_PASSWORD=your_mailtrap_password
```

> ⚠️ **Note:** For image uploads to work, ensure the `public/img/users` directory exists in the root folder.

## 📧 Contact

For any questions or feedback, feel free to contact:  
**Ozan Demircan** – ozandmrcn47@gmail.com
