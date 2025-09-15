@echo off
echo Starting MongoDB...
mkdir C:\data\db 2>nul
"C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe" --dbpath C:\data\db