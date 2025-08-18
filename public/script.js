document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('guestbook-form');
    const successMessage = document.getElementById('success-message');

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            message: document.getElementById('message').value,
            newsletter_signup: document.getElementById('newsletter').checked
        };

        try {
            const response = await fetch('/api/sign', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                form.style.display = 'none';
                successMessage.style.display = 'block';
                
                setTimeout(() => {
                    form.reset();
                    form.style.display = 'block';
                    successMessage.style.display = 'none';
                }, 3000);
            } else {
                alert(data.error || 'Failed to sign guestbook');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Failed to connect to server');
        }
    });
});