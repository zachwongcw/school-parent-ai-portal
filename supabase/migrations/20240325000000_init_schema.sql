-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table 1: Students (Highly restricted, managed by school admin)
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_no VARCHAR(20) UNIQUE NOT NULL,
    student_name VARCHAR(100) NOT NULL,
    class_name VARCHAR(10) NOT NULL,
    parent_pin VARCHAR(6) NOT NULL -- Distributed via circular
);

-- Table 2: Chat Sessions (Anonymized)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id), -- Only populated if an action is triggered
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_flagged_crisis BOOLEAN DEFAULT FALSE
);

-- Table 3: Chat Messages (Rolling logs)
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(10) CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Table 4: Action Requests (Forms A, B, and SENCO Pipeline)
CREATE TABLE IF NOT EXISTS action_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    student_id UUID REFERENCES students(id) NOT NULL,
    request_type VARCHAR(50) CHECK (request_type IN ('FORM_A', 'FORM_B', 'SENCO_REFERRAL')),
    payload JSONB NOT NULL, -- Flexible schema for different form types
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Row Level Security (RLS)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_requests ENABLE ROW LEVEL SECURITY;

-- Note: In a real scenarios, you would add policies to restrict access based on auth.uid()
-- For now, we enable basic insertion and lookups for the authenticated service.
