# ASL Hub - Learning Management System

A comprehensive ASL (American Sign Language) learning management system with student progress tracking, teacher dashboard, and interactive skill management.

## Features

### Student Features
- **User Registration & Login**: Students can create accounts using the class password "MGHS"
- **Interactive Dashboard**: Clean, modern interface with progress tracking
- **Skills Progress Tracking**: Visual progress bar with color-coded completion levels
- **Skill Management**: Students can update their progress through three levels:
  - Not Started (0 points) - Red
  - Progressing (1 point) - Yellow  
  - Proficient (3 points) - Green
- **Resource Access**: Direct access to learning resources for each skill
- **Forgot Password**: Email-based password recovery system

### Teacher Features
- **Teacher Dashboard**: Comprehensive overview of all student progress
- **Student Management**: View detailed progress for each student
- **Skills Overview**: Summary statistics across all skills
- **Super User Access**: Teachers have elevated permissions
- **Progress Monitoring**: Real-time tracking of student advancement

### Technical Features
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **AJAX Updates**: Real-time progress updates without page refreshes
- **Clean UI**: Modern design inspired by professional learning platforms
- **Database Security**: Prepared statements and input validation
- **Password Security**: Secure password hashing and reset functionality

## Setup Instructions

### 1. Database Setup
```sql
-- Run the database_setup.sql file to create the required tables
mysql -u your_username -p your_database < database_setup.sql
```

### 2. Configure Database Connection
Edit `config.php` with your database credentials:
```php
$servername = "localhost";
$username = "your_db_username";
$password = "your_db_password";
$dbname = "your_database_name";
```

### 3. Populate Sample Data
Run the sample data script:
```bash
php populate_sample_data.php
```

### 4. Teacher Account
- **Name**: Brandon Harms
- **Password**: Dark-dude3
- **Email**: brandon.harms@mghs.edu

## Usage

### For Students
1. Visit the ASL Hub login page
2. Create a new account using the class password "MGHS"
3. Fill in your information including school email
4. Login with your name and chosen password
5. Track your progress through the Skills section
6. Update your skill levels as you improve

### For Teachers
1. Login with teacher credentials (Brandon Harms / Dark-dude3)
2. Access the teacher dashboard to view all student progress
3. Monitor skill completion rates
4. Manage skills and resources (future feature)

## File Structure

```
asl/
├── config.php                 # Database configuration
├── index.php                  # Main login page
├── login.php                  # Login handler
├── register.php               # Registration handler
├── dashboard.php              # Student dashboard
├── teacher_dashboard.php      # Teacher dashboard
├── skills.php                 # Skills tracking page
├── forgot_password.php        # Password recovery handler
├── reset_password.php         # Password reset page
├── update_skill_status.php    # AJAX skill update handler
├── logout.php                 # Logout handler
├── css/
│   └── asl-style.css         # Main stylesheet
├── database_setup.sql         # Database schema
├── populate_sample_data.php   # Sample data script
└── README.md                 # This file
```

## Database Schema

### Tables
- **users**: Student and teacher accounts
- **skills**: Available skills/learning objectives
- **user_skills**: Student progress tracking
- **resources**: Learning resources linked to skills

### Key Fields
- Users have roles (student/teacher)
- Skills have point values for each progress level
- Progress is tracked with timestamps
- Email-based password recovery tokens

## Security Features

- Input validation and sanitization
- SQL injection protection via prepared statements
- Password hashing using PHP's password_hash()
- Session management and access control
- CSRF protection for sensitive operations
- Email verification for password resets

## Customization

### Adding New Skills
Teachers can add new skills through the teacher dashboard, or you can directly insert into the database:

```sql
INSERT INTO skills (skill_name, skill_description, points_not_started, points_progressing, points_proficient, order_index) 
VALUES ('New Skill', 'Description', 0, 1, 3, 3);
```

### Styling
The system uses a clean, modern design with:
- Gradient backgrounds
- Card-based layouts
- Responsive grid systems
- Color-coded progress indicators
- Smooth animations and transitions

## Future Enhancements

- Scroller Game integration
- Advanced progress analytics
- File upload for skill resources
- Email notifications for progress milestones
- Mobile app development
- Integration with external ASL resources

## Support

For technical issues or questions about the ASL Hub system, please contact the system administrator or check the documentation in the code comments.