import psycopg2, base64, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))

with open('test-video.mp4', 'rb') as f:
    raw = f.read()

b64 = base64.b64encode(raw).decode()

conn = psycopg2.connect(host='localhost', user='aqs', password='aqs123', dbname='aqs_learning')
cur = conn.cursor()

doc_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
file_size = len(raw)

cur.execute("SELECT 1 FROM documents WHERE id = %s", (doc_id,))
if cur.fetchone():
    print("Document already exists, skipping insert")
else:
    # Find the first lesson in a course the test student is enrolled in
    cur.execute("""
        SELECT l.id FROM lessons l
        JOIN courses c ON c.id = l.course_id
        JOIN enrollments e ON e.course_id = c.id
        WHERE e.user_id = (SELECT id FROM users WHERE uid = 'cfEkQPxBB3b0if8Dx7jRtiGLW743')
        ORDER BY l.course_id, l.sort_order LIMIT 1
    """)
    lesson_row = cur.fetchone()
    lesson_id = lesson_row[0] if lesson_row else 1
    print("Using lesson_id=%d for video document" % lesson_id)

    cur.execute("""
        INSERT INTO documents (id, lesson_id, original_file_name, stored_file_name, mime_type, file_size, uploaded_by, file_data)
        VALUES (%s, %s, 'test-video.mp4', 'test-video.mp4', 'video/mp4', %s, (SELECT id FROM users LIMIT 1), %s)
    """, (doc_id, lesson_id, file_size, b64))
    conn.commit()
    print("Inserted video document: id=%s size=%d" % (doc_id, file_size))

cur.execute("SELECT id, mime_type, file_size FROM documents WHERE id = %s", (doc_id,))
row = cur.fetchone()
print("Verified: id=%s mime=%s size=%d" % row)

# Update the lesson to use this video document
cur.execute("""
    UPDATE lessons SET video_url = 'doc:' || %s
    WHERE id = %s AND video_url NOT LIKE 'doc:%%'
    RETURNING id, title, video_url
""", (doc_id, lesson_id))
updated = cur.fetchone()
if updated:
    conn.commit()
    print("Updated lesson %s: %s -> video_url=%s" % updated)
else:
    # Lesson already has a doc: video_url or wasn't updated
    cur.execute("SELECT id, title, video_url FROM lessons WHERE id = %s", (lesson_id,))
    row = cur.fetchone()
    print("Lesson %s already has video_url=%s" % (row[0], row[2]))
    conn.commit()

# Check if there's already a course with video lesson
cur.execute("""
    SELECT c.id, c.title, l.id as lesson_id, l.title as lesson_title
    FROM courses c
    JOIN lessons l ON l.course_id = c.id
    WHERE l.video_url LIKE 'doc:%%'
    LIMIT 5
""")
rows = cur.fetchall()
if rows:
    print("\nExisting courses with doc: video_url:")
    for r in rows:
        print("  course %s (%s) -> lesson %s (%s)" % r)
else:
    print("\nNo courses have doc: video_url yet")

# Find a course the student is enrolled in, and create a video lesson
cur.execute("""
    SELECT c.id, c.title FROM courses c
    JOIN enrollments e ON e.course_id = c.id
    WHERE e.user_id = (SELECT id FROM users WHERE uid = 'cfEkQPxBB3b0if8Dx7jRtiGLW743')
    ORDER BY c.id
""")
enrolled_courses = cur.fetchall()
print("\nCourses student is enrolled in:")
for r in enrolled_courses:
    print("  course %s: %s" % r)

cur.close()
conn.close()
