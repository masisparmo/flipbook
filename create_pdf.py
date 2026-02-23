from reportlab.pdfgen import canvas
import os

def create_pdf(filename):
    c = canvas.Canvas(filename)
    c.drawString(100, 750, "Hello World")
    c.drawString(100, 730, "This is a test PDF for search functionality.")
    c.drawString(100, 710, "Keyword: UniqueKeyword123")
    c.save()

if __name__ == "__main__":
    if not os.path.exists("/home/jules/verification"):
        os.makedirs("/home/jules/verification")
    create_pdf("/home/jules/verification/test.pdf")
