const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

console.log('Supabase URL:', JSON.stringify(supabaseUrl));
console.log('Supabase URL valid:', URL.canParse(supabaseUrl));

if (!supabaseUrl || !supabaseSecretKey) {
    throw new Error('Supabase environment variables are missing.');
}

const supabase = createClient(
    supabaseUrl,
    supabaseSecretKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

module.exports = supabase;